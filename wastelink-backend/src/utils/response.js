/**
 * Standardised JSON response envelope used across all endpoints.
 * Frontend can reliably destructure { data, error, meta }.
 */

export const send = {
  ok(res, data = null, meta = {}) {
    return res.status(200).json({ success: true, data, meta });
  },
  created(res, data = null) {
    return res.status(201).json({ success: true, data });
  },
  noContent(res) {
    return res.status(204).send();
  },
  paginated(res, data, { total, page, limit }) {
    return res.status(200).json({
      success: true,
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  },
};

// ── Pagination helper ──────────────────────────────────────────────
export function parsePagination(query) {
  const page  = Math.max(1, parseInt(query.page  || '1',  10));
  const limit = Math.min(100, parseInt(query.limit || '20', 10));
  return { page, limit, offset: (page - 1) * limit };
}
