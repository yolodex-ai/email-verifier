/**
 * Email detectors
 *
 * Export all detection functions for different email characteristics.
 */

export { isDisposableEmail, isDisposableDomain } from './disposable';
export { isRoleBasedEmail, isRoleBasedLocalPart } from './role-based';
export { isFreeEmail, isFreeEmailDomain } from './free-provider';

