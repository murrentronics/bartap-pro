import { J as registerPlugin } from "./router-Pg2sn0UL.js";
import "./server-Db6rHqEp.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-D7YF3rP5.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
