import { w as registerPlugin } from "./router-C0NdaLQ6.js";
import "./server-92YZiT0U.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-DPaOuDFG.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
