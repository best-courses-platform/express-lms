// domains/users/user.routes.ts
import { Router } from "express";
import { UserController } from "./user.controller";

const usersRoutes = Router();

usersRoutes.post("/", ...UserController.createUser);
usersRoutes.get("/", UserController.listUsers);
usersRoutes.get("/:id", ...UserController.getUser);
usersRoutes.patch("/:id", ...UserController.updateUser);
usersRoutes.delete("/:id", ...UserController.deleteUser);

export default usersRoutes;