import { w as registerPlugin } from "./router-B5BIB3V9.js";
import "./server-tGmdnvoG.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-CGxpidIn.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
