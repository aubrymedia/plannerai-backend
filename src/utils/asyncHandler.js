/**
 * Wrapper pour gérer les erreurs dans les fonctions async
 * Évite d'avoir à utiliser try/catch dans chaque contrôleur
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

