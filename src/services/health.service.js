const healthService = {
  /**
   * Returns basic health information about the server.
   */
  getHealthStatus() {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(process.uptime())}s`,
      environment: process.env.NODE_ENV || "development",
      memoryUsage: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
      },
    };
  },
};

export default healthService;
