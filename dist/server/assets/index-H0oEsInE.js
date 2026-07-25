import { w as registerPlugin } from "./router-x910fWzH.js";
import "./server-NQJBMXGO.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-D-jV-11N.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
