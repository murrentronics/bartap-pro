import { H as registerPlugin } from "./router-BVkVTQ1g.js";
import "./server-Cy59YT7_.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-BcyjIzQs.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
