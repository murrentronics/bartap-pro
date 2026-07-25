import { v as registerPlugin } from "./router-ChpB8xKS.js";
import "./server-ql_THtAa.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
var Weekday;
(function(Weekday2) {
  Weekday2[Weekday2["Sunday"] = 1] = "Sunday";
  Weekday2[Weekday2["Monday"] = 2] = "Monday";
  Weekday2[Weekday2["Tuesday"] = 3] = "Tuesday";
  Weekday2[Weekday2["Wednesday"] = 4] = "Wednesday";
  Weekday2[Weekday2["Thursday"] = 5] = "Thursday";
  Weekday2[Weekday2["Friday"] = 6] = "Friday";
  Weekday2[Weekday2["Saturday"] = 7] = "Saturday";
})(Weekday || (Weekday = {}));
const LocalNotifications = registerPlugin("LocalNotifications", {
  web: () => import("./web-Bs3nJxOw.js").then((m) => new m.LocalNotificationsWeb())
});
export {
  LocalNotifications,
  Weekday
};
