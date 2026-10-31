require('dns').setServers(['8.8.8.8', '1.1.1.1']);
"use strict";

require("dotenv").config();
const { connectDatabase, disconnectDatabase } = require("../config/db");
const { seedDatabase } = require("../services/seedService");

async function main() {
  try {
    await connectDatabase();
    const result = await seedDatabase();
    console.log(`Seeded project "${result.project.title}" with ${result.team.length} team members, ${result.requirements.length} requirements and ${result.activities.length} activities.`);
  } catch (error) {
    console.error("Sample data could not be seeded:", error.message);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

main();
