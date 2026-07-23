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
        if (!origin || envs.CORS_ALLOWED_ORIGINS.length === 0) {
          return callback(null, true);
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
    this.httpServer.listen(this.port, this.host, () => {
      console.log(`[LOCALOPE] Server running on ${this.host}:${this.port}`);
    });
  }
}
