import healthService from "../services/health.service.js";

const healthController = {
  /**
   * GET /api/health
   * Returns server health status.
   */
  getHealth(_req, res) {
    const health = healthService.getHealthStatus();
    res.status(200).json({ success: true, data: health });
  },
};

export default healthController;
