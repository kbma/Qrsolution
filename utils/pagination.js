/**
 * Utilitaire pour gérer la pagination
 */

function getPaginationParams(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = req.query.limit === 'all' ? 0 : Math.max(1, parseInt(req.query.limit) || 10);
  const skip = limit > 0 ? (page - 1) * limit : 0;

  return { page, limit, skip };
}

function buildPaginationResponse(data, total, { page, limit }) {
  return {
    success: true,
    count: data.length,
    total: total,
    page: limit > 0 ? page : 1,
    pages: limit > 0 ? Math.ceil(total / limit) : 1,
    limit: limit,
    data: data
  };
}

module.exports = {
  getPaginationParams,
  buildPaginationResponse
};
