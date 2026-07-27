import { w as registerPlugin } from "./router-BDHbD42e.js";
import "./server-C9dc7jn3.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-Dpy4TZxc.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
