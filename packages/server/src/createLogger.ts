import { openapiLogger, consoleTransport, fileTransport } from '@openapi-platform/logger';
import { config } from './config';

export function createLogger() {
  const logger = openapiLogger()
    .add(consoleTransport(config.get('server.log.console')))
    .add(fileTransport(config.get('server.log.file')));
  logger.exceptions.handle(fileTransport(config.get('server.log.error')));
  return logger;
}
