import winston from 'winston';

const { combine, timestamp, colorize, printf, json } = winston.format;

const devFormat = printf(({ level, message, timestamp, ...meta }) => {
  const extras = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  return `${timestamp} [${level}] ${message}${extras}`;
});

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: process.env.NODE_ENV === 'production'
    ? combine(timestamp(), json())
    : combine(timestamp({ format: 'HH:mm:ss' }), colorize(), devFormat),
  transports: [new winston.transports.Console()],
});
