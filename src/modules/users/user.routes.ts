import { Router } from "express";
import * as UserController from "./user.controller";

const router = Router();

router.post("/", UserController.createUser);
router.get("/", UserController.listUsers);
router.get("/:id", UserController.getUser);
router.patch("/:id", UserController.updateUser);
router.delete("/:id", UserController.deleteUser);

export default router;