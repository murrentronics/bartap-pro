import { J as registerPlugin } from "./router-KQFuUJeL.js";
import "./server-CvPu0oa7.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-B5pN0CGb.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
