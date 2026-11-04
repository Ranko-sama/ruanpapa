# 开发文档

[返回首页](../README.md) · [消融实验记录](../experiments/README.md)

## 本地运行

本仓库根目录就是完整静态网页游戏。浏览器资源与 Three.js 已随项目打包，无需构建或安装运行依赖。

使用任意静态 HTTP 服务器打开项目。例如安装 Python 3 后，在仓库根目录运行：

```sh
python -m http.server 4173 --bind 127.0.0.1
```

在浏览器打开 `http://127.0.0.1:4173/`。浏览器 ES 模块需要通过 HTTP 访问。

GitHub Pages 从 `main` 分支的根目录发布。在线联机通过邀请链接与回执码完成 WebRTC 配对，静态服务器无需提供配对接口。

## 代码位置

| 文件 | 职责 |
| --- | --- |
| `index.html`、`app.js`、`style.css` | 大厅、收藏、对局配置与界面 |
| `sim.js`、`colliders.js`、`arena-geometry.js` | 固定步长物理、碰撞与舞台几何 |
| `fighter-rig.js`、`headgear.js`、`jelly.js` | 角色关节、头饰安装与果冻形变 |
| `view.js`、`canvas-tps.js`、`camera.js` | WebGL、Canvas 回退与三种镜头 |
| `match.js`、`party.js` | 对局循环、回放与 WebRTC 联机 |
| `assets/` | 材质、角色、场景、音效与美术资源 |
| `test/` | 回归测试 |
| `experiments/` | 消融实验记录与逐帧比较脚本 |

物理模拟以固定 60 Hz 步进运行。联机时由房主运行物理并同步画面。WebGL 与 Canvas 回退共用同一套模拟。

水果啫喱材质按身体厚度与回弹形变实时折射场景；Canvas 通过局部扭曲背景近似这个效果。角色碰撞体跟随可见关节变形，泡泡弹使用运动轨迹检测，近战按武器挥动范围判定。

## 测试与复验

```sh
node --test
```

测试需要 Node.js 18 或以上。当前包含 43 项回归测试，覆盖击飞、碰撞、地板、头饰、镜头、果冻材质、机关、玩法和联机状态。

精简设计时的逐帧对照、浏览器测量、保留与撤回的改动，以及完整复验命令，见[消融实验记录](../experiments/README.md)。
