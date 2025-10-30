import { Router } from 'express';
import * as ViewController from './view.controller';
// import { isAuthenticated } from '../middleware/auth';

const viewsRouter = Router();

// Public routes
viewsRouter.get('/', ViewController.renderHome);
viewsRouter.get('/login', ViewController.renderLogin);
viewsRouter.get('/register', ViewController.renderRegister);

// Courses collection routes
// viewsRouter.get('/courses', ViewController.renderCourses);           // GET /courses - список курсов
// viewsRouter.get('/courses/create', isAuthenticated, ViewController.renderCourseCreate); // GET /courses/create - форма создания
// Course instance routes
// viewsRouter.get('/courses/instance/:id', ViewController.renderCourseDetail); // GET /courses/instance/:id - детали курса

// Profile
// viewsRouter.get('/profile', isAuthenticated, ViewController.renderProfile);

// 404 handler
viewsRouter.get('*', ViewController.renderNotFound);

export default viewsRouter;