import { K as registerPlugin } from "./router-CerKS5nD.js";
import "./server-DwZtvdF3.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-N6Nt6pHe.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
