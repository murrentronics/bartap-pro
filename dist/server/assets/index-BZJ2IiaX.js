import { v as registerPlugin } from "./router-ChpB8xKS.js";
import "./server-ql_THtAa.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-z9LTAaSp.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
