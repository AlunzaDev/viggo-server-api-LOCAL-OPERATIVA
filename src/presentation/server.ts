import cors, { CorsOptions } from "cors";
import express, { Router } from "express";
import { createServer, Server as HttpServer } from "http";
import { envs } from "../config/plugins/envs.plugin";
import { MongoDatabase } from "../data/mongo";
import { requestLoggingMiddleware } from "./middlewares/request-logging.middleware";
import { SocketServerPlugin } from "./sockets/socket-server";

interface ServerOptions {
  host?: string;
  port: number;
  publicPath?: string;
  routes: Router;
}

export class Server {
  private static readonly fallbackPort = 3002;
  private readonly app = express();
  private readonly httpServer: HttpServer;
  private readonly host: string;
  private readonly port: number;
  private readonly publicPath: string;
  private readonly routes: Router;

  constructor({
    host = "0.0.0.0",
    port,
    publicPath = "public",
    routes,
  }: ServerOptions) {
    this.host = host;
    this.port = port;
    this.publicPath = publicPath;
    this.routes = routes;
    this.httpServer = createServer(this.app);
  }

  async start(): Promise<void> {
    await MongoDatabase.connect({
      mongoUrl: envs.MONGO_URL,
      dbName: envs.MONGO_DB_NAME,
    });

    const corsOptions: CorsOptions = {
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }
        if (envs.CORS_ALLOWED_ORIGINS.length === 0) {
          return callback(null, !envs.PROD);
        }
        return callback(null, envs.CORS_ALLOWED_ORIGINS.includes(origin));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Authorization",
        "Content-Type",
        "X-Requested-With",
        "X-Token",
        "X-API-KEY",
        "Idempotency-Key",
      ],
    };

    this.app.disable("x-powered-by");
    this.app.use(cors(corsOptions));
    this.app.use(express.json({ limit: "2mb" }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.static(this.publicPath));
    this.app.use(requestLoggingMiddleware);
    this.app.use(this.routes);

    this.app.use((_req, res) => {
      res.status(404).json({ error: "Ruta no encontrada" });
    });

    SocketServerPlugin.init(this.httpServer);
    await this.listenWithFallback(this.port);
  }

  private listenWithFallback(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => {
        this.httpServer.off("listening", onListening);

        if (error.code === "EADDRINUSE" && port === this.port) {
          console.warn(
            `[OPERATIVO] Port ${port} is busy. Trying ${Server.fallbackPort}.`,
          );
          this.listenWithFallback(Server.fallbackPort).then(resolve).catch(reject);
          return;
        }

        reject(error);
      };

      const onListening = () => {
        this.httpServer.off("error", onError);
        console.log(`[OPERATIVO] Server running on ${this.host}:${port}`);
        resolve();
      };

      this.httpServer.once("error", onError);
      this.httpServer.once("listening", onListening);
      this.httpServer.listen(port, this.host);
    });
  }
}
