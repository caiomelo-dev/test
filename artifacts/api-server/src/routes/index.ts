import { Router, type IRouter } from "express";
import healthRouter from "./health";
import espnRouter from "./espn";
import analyzeRouter from "./analyze";
import auditDataRouter from "./audit-data";
import oddsRouter from "./odds";

const router: IRouter = Router();

router.use(healthRouter);
router.use(espnRouter);
router.use(analyzeRouter);
router.use(auditDataRouter);
router.use(oddsRouter);

export default router;
