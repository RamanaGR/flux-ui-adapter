import { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function landingRoutes(app: FastifyInstance): Promise<void> {
  await app.register(fastifyStatic, {
    root: join(__dirname, "../../public"),
    prefix: "/",
    decorateReply: false,
  });
}
