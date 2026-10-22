import { attachOrderChild } from "../tasks.ts"

const [orderProject, orderN, childProject, childN, orderVersion, childVersion] = process.argv.slice(2)
const result = attachOrderChild(
  { project: orderProject, n: Number(orderN) },
  { project: childProject, n: Number(childN) },
  { orderVersion, childVersion },
  "synthetic-race-worker",
)
process.stdout.write(JSON.stringify(result))
