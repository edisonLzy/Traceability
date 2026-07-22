import { init, startResourceMonitor } from "@traceability/electron/main";

init({ dsn: "https://dummy@localhost/1" });
startResourceMonitor();
