import { v as registerPlugin } from "./router-BX_tLjie.js";
import "./server-DHEedKO6.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-BITDlVit.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
