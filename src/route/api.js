import express from "express";
import multer from "multer";
import userController from "../controller/user-controller.js";
import contactController from "../controller/contact-controller.js";
import { registerFace, matchFace } from "../controller/face-controller.js";
import { authMiddleware } from "../middleware/auth-middleware.js";

const userRouter = express.Router();
const upload = multer({ dest: 'uploads/' });

userRouter.use(authMiddleware);

userRouter.get('/api/users/current', userController.get);
userRouter.patch('/api/users/current', userController.update);
userRouter.delete('/api/users/logout', userController.logout);

userRouter.post('/api/contacts', contactController.create);
userRouter.get('/api/contacts/:contactId', contactController.get);
userRouter.put('/api/contacts/:contactId', contactController.update);
userRouter.delete('/api/contacts/:contactId', contactController.remove);
userRouter.get('/api/contacts', contactController.search);

userRouter.post("/api/face/register", authMiddleware, upload.single("file1"), registerFace);
userRouter.post("/api/face/match", authMiddleware, upload.single('file1'), matchFace);

export {
    userRouter
};
