import { w as registerPlugin } from "./router-CVI5s33s.js";
import "./server-C_mMGMSY.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-B4Loxo9P.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
