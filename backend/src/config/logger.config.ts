import { WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';

export function buildLoggerConfig(level = 'info'): WinstonModuleOptions {
  const isProd = process.env.NODE_ENV === 'production';

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: isProd
        ? winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: 'HH:mm:ss' }),
            winston.format.printf(({ timestamp, level: lvl, message, context, stack }) => {
              const ctx = context ? ` [${context}]` : '';
              const err = stack ? `\n${stack}` : '';
              return `${timestamp} ${lvl}${ctx}: ${message}${err}`;
            })
          )
    })
  ];

  return {
    level,
    transports,
    exitOnError: false
  };
}
