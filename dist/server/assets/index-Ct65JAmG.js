import { w as registerPlugin } from "./router-DWYa-7YT.js";
import "./server-DeJL325l.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-DT3Usdlt.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
