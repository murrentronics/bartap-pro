import { w as registerPlugin } from "./router-DvLizL_W.js";
import "./server-D63KsCdB.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-CdEjBo_8.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
