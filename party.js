// Signalling is needed only for pairing. All inputs and frames travel peer to peer.
const encode = (d) =>
  btoa(JSON.stringify({ type: d.type, sdp: d.sdp }))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
function decode(raw, type) {
  try {
    const str = raw.trim().split('#invite=').pop();
    if (!str || str.length > 64000) throw Error();
    const d = JSON.parse(atob(str.replaceAll('-', '+').replaceAll('_', '/')));
    if (d.type !== type || !d.sdp?.startsWith('v=0')) throw Error();
    return d;
  } catch {
    throw Error(
      type === 'offer'
        ? '邀请码无效，请完整复制房主的邀请码或链接。'
        : '回执码无效，请粘贴好友生成的完整回执码。',
    );
  }
}
async function api(path, opts) {
  const r = await fetch(path, { cache: 'no-store', ...opts });
  if (!r.ok)
    throw Error(
      r.status === 409
        ? '房间已有玩家加入。'
        : '没有找到房间。请确认两台设备打开的是同一个局域网地址，房间码在五分钟内有效。',
    );
  return r.json();
}
const post = (data) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});
export class Party {
  constructor(onMessage, onState) {
    this.onMessage = onMessage;
    this.onState = onState;
    this.pc = null;
    this.ch = null;
    this.role = '';
    this.direct = false;
  }
  get ready() {
    return this.ch?.readyState === 'open';
  }
  async discover() {
    try {
      this.direct = (await api('./api/party')).rooms === 1;
    } catch {
      this.direct = false;
    }
    return this.direct;
  }
  close(tell = true) {
    clearInterval(this.poll);
    clearTimeout(this.lost);
    if (this.ch) {
      this.ch.onopen = null;
      this.ch.onclose = null;
      this.ch.onmessage = null;
      this.ch.close();
    }
    if (this.pc) {
      this.pc.onconnectionstatechange = null;
      this.pc.ondatachannel = null;
      this.pc.close();
    }
    this.manualCode = '';
    this.roomCode = '';
    this.ch = this.pc = null;
    this.role = '';
    if (tell) this.onState('closed');
  }
  setup(role, localRoom = this.direct) {
    this.close(false);
    if (!window.RTCPeerConnection) throw Error('当前浏览器未提供 WebRTC。可用桌面 Chrome 或 Edge 打开游戏。');
    this.role = role;
    this.pc = new RTCPeerConnection({
      iceServers: localRoom ? [] : [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    const pc = this.pc;
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === 'failed') {
        this.close(false);
        this.onState('failed');
      }
      if (pc.connectionState === 'disconnected') {
        clearTimeout(this.lost);
        this.lost = setTimeout(() => {
          if (this.pc === pc && pc.connectionState === 'disconnected') this.close();
        }, 6000);
      }
    };
    if (role === 'host') this.channel(pc.createDataChannel('jelly-arena'));
    else pc.ondatachannel = (e) => this.channel(e.channel);
    return pc;
  }
  channel(ch) {
    this.ch = ch;
    ch.onopen = () => {
      clearInterval(this.poll);
      this.onState('connected');
    };
    ch.onclose = () => {
      if (this.ch === ch) this.close();
    };
    ch.onmessage = (e) => {
      try {
        if (typeof e.data === 'string' && e.data.length < 60000) {
          const m = JSON.parse(e.data);
          if (m && typeof m.type === 'string') this.onMessage(m);
        }
      } catch {}
    };
  }
  async local(pc, d) {
    await pc.setLocalDescription(d);
    await new Promise((resolve) => {
      const done = () => {
        clearTimeout(id);
        pc.removeEventListener('icegatheringstatechange', changed);
        resolve();
      };
      const changed = () => {
        if (pc.iceGatheringState === 'complete') done();
      };
      const id = setTimeout(done, this.direct ? 1800 : 4200);
      pc.addEventListener('icegatheringstatechange', changed);
      changed();
    });
    if (pc !== this.pc) throw Error('配对已取消。');
    return pc.localDescription.toJSON();
  }
  async host() {
    const pc = this.setup('host');
    const offer = await this.local(pc, await pc.createOffer());
    let room;
    try {
      if (this.direct) room = await api('./api/rooms', post({ offer }));
    } finally {
      // Keep the manual invitation available if the room service fails.
      if (!room?.code && this.pc === pc) this.manualCode = encode(offer);
    }
    if (this.pc !== pc) throw Error('配对已取消。');
    if (!room?.code) return this.manualCode;
    const { code, token } = room;
    this.roomCode = code;
    let busy = false;
    this.poll = setInterval(async () => {
      if (busy || pc !== this.pc) return;
      busy = true;
      try {
        const { answer } = await api('./api/rooms/' + code + '/answer', {
          headers: { 'X-Party-Token': token },
        });
        if (answer && this.pc === pc) {
          clearInterval(this.poll);
          await pc.setRemoteDescription(answer);
        }
      } catch {
        if (pc === this.pc) {
          clearInterval(this.poll);
          this.onState('expired');
        }
      } finally {
        busy = false;
      }
    }, 650);
    return code;
  }
  async join(raw) {
    raw = raw.trim();
    const short = this.direct && /^\d{6}$/.test(raw);
    const invitation = short ? null : decode(raw, 'offer');
    const pc = this.setup('guest', short);
    try {
      const offer = invitation ?? (await api('./api/rooms/' + raw)).offer;
      if (pc !== this.pc) throw Error('配对已取消。');
      await pc.setRemoteDescription(offer);
      const answer = await this.local(pc, await pc.createAnswer());
      if (short) await api('./api/rooms/' + raw + '/answer', post({ answer }));
      if (pc !== this.pc) throw Error('配对已取消。');
      this.manualCode = short ? '' : encode(answer);
      return this.manualCode;
    } catch (err) {
      if (pc === this.pc) this.close(false);
      throw err;
    }
  }
  async accept(raw) {
    if (!this.pc || this.role !== 'host') throw Error('请先创建房间。');
    await this.pc.setRemoteDescription(decode(raw, 'answer'));
  }
  send(type, payload = {}) {
    if (!this.ready || (type === 'frame' && this.ch.bufferedAmount > 55000)) return;
    this.ch.send(JSON.stringify({ type, ...payload }));
  }
}
