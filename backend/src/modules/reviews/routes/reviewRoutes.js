import { Router } from 'express';
import { ReviewController } from '../controllers/reviewController.js';
import { authenticate } from '../../../middleware/auth.js';
import { validateBody } from '../../auth/validators/authValidator.js';
import { validateQuery } from '../../../validators/validate.js';
import { validateUuidParams } from '../../../middleware/validateParams.js';
import {
  createReviewSchema,
  updateReviewSchema,
  listReviewsSchema,
} from '../validators/reviewValidator.js';

const router = Router();

/**
 * @route   POST /api/v1/reviews
 * @desc    Review a verified contribution
 * @access  Private (REVIEWER / MAINTAINER / ADMIN / repository maintainer)
 */
router.post('/', authenticate, validateBody(createReviewSchema), ReviewController.createReview);

/**
 * @route   GET /api/v1/reviews/me
 * @desc    Reviews written by the authenticated user
 * @access  Private
 */
router.get(
  '/me',
  authenticate,
  validateQuery(listReviewsSchema),
  ReviewController.getMyReviews
);

/**
 * @route   GET /api/v1/reviews/contribution/:contributionId
 * @desc    Reviews for a contribution with an aggregate summary
 * @access  Public
 */
router.get(
  '/contribution/:contributionId',
  validateUuidParams('contributionId'),
  validateQuery(listReviewsSchema),
  ReviewController.getContributionReviews
);

/**
 * @route   PATCH /api/v1/reviews/:reviewId
 * @desc    Update your own review
 * @access  Private (review author or ADMIN)
 */
router.patch(
  '/:reviewId',
  authenticate,
  validateUuidParams('reviewId'),
  validateBody(updateReviewSchema),
  ReviewController.updateReview
);

export default router;
