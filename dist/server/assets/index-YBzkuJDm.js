import { v as registerPlugin } from "./router-CRsJpeT2.js";
import "./server-trY-Z65E.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-CslDEtN3.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
