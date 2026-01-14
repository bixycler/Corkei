import GCGraphConfig from './config.js';
import AccessLogExtension from './access_log.js';
import ServiceLogExtension from './service_log.js';

const ServiceAccessLogExtension = {
  name: 'ServiceAccessLog',
  _accessLog: null,
  _serviceLog: null,

  reset() {
    // Create fresh instances by copying the extension objects
    this._accessLog = Object.create(AccessLogExtension);
    this._accessLog._events = [];
    if (AccessLogExtension.reset) AccessLogExtension.reset.call(this._accessLog);

    this._serviceLog = Object.create(ServiceLogExtension);
    this._serviceLog._events = [];
    this._serviceLog._activeCalls = new Map();
    if (ServiceLogExtension.reset) ServiceLogExtension.reset.call(this._serviceLog);

    console.log("[ServiceAccessLog] Reset.");
  },

  parse(line) {
    let parsed = false;

    if (this._accessLog && AccessLogExtension.parse) {
      parsed = AccessLogExtension.parse.call(this._accessLog, line) || parsed;
    }

    if (this._serviceLog && ServiceLogExtension.parse) {
      parsed = ServiceLogExtension.parse.call(this._serviceLog, line) || parsed;
    }

    return parsed;
  },

  finish() {
    if (this._accessLog && AccessLogExtension.finish) {
      AccessLogExtension.finish.call(this._accessLog);
    }

    if (this._serviceLog && ServiceLogExtension.finish) {
      ServiceLogExtension.finish.call(this._serviceLog);
    }

    console.log(`[ServiceAccessLog] Finish. AccessLog: ${this._accessLog?._events?.length || 0}, ServiceLog: ${this._serviceLog?._events?.length || 0}`);
  },

  render(chartGroup, scales, dims) {
    console.log(`[ServiceAccessLog] Render called.`);

    if (!AccessLogExtension || !ServiceLogExtension) {
      console.error("[ServiceAccessLog] Component extensions not found!");
      return;
    }

    const config = GCGraphConfig?.serviceAccessLog || {};

    // Calculate Y-offset for ServiceLog
    const accessLogVisuals = config.accessLog?.visuals || GCGraphConfig?.accessLog?.visuals || {};
    const highlightRadius = accessLogVisuals.highlightDotRadius || 4;
    const yOffset = config.yOffset === 'auto' ? (highlightRadius * 2.5 + 2) : (config.yOffset || 12);

    // Merge configs for each component
    const accessLogConfig = {
      ...GCGraphConfig.accessLog,
      ...config.accessLog,
      metrics: config.accessLog?.metrics || ['Bps'],
      showStatusBar: config.accessLog?.showStatusBar !== undefined ? config.accessLog.showStatusBar : false
    };

    const serviceLogConfig = {
      ...GCGraphConfig.serviceLog,
      ...config.serviceLog,
      metrics: config.serviceLog?.metrics || ['goodsRate']
    };

    // Temporarily override configs
    const originalAccessConfig = GCGraphConfig.accessLog;
    const originalServiceConfig = GCGraphConfig.serviceLog;

    GCGraphConfig.accessLog = accessLogConfig;
    GCGraphConfig.serviceLog = serviceLogConfig;

    // Render AccessLog at y=0
    if (this._accessLog && AccessLogExtension.render) {
      AccessLogExtension.render.call(this._accessLog, chartGroup, scales, dims);
    }

    // Render ServiceLog with Y-offset
    if (this._serviceLog && ServiceLogExtension.render) {
      // Create a transformed group for ServiceLog
      const serviceGroup = chartGroup.append('g')
        .attr('class', 'ext-service-log-offset')
        .attr('transform', `translate(0, ${yOffset})`);

      ServiceLogExtension.render.call(this._serviceLog, serviceGroup, scales, dims);
    }

    // Restore original configs
    GCGraphConfig.accessLog = originalAccessConfig;
    GCGraphConfig.serviceLog = originalServiceConfig;
  },

  onZoom(event) {
    if (this._accessLog && AccessLogExtension.onZoom) {
      AccessLogExtension.onZoom.call(this._accessLog, event);
    }

    if (this._serviceLog && ServiceLogExtension.onZoom) {
      ServiceLogExtension.onZoom.call(this._serviceLog, event);
    }
  }
};

export default ServiceAccessLogExtension;
