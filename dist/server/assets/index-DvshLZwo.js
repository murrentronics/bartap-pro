import { w as registerPlugin } from "./router-B79ODM_U.js";
import "./server-7IsNO3zA.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-BT9Oj00f.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
