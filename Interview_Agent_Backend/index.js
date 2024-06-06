import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { pull } from "langchain/hub";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { DynamicTool, DynamicStructuredTool } from "@langchain/core/tools";
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk-proj-cMi3oUDMt5ESdDamKUY8T3BlbkFJS9bOrqeHzZLMxzE4U1KB", // Your OpenAI API key here, I used "-" to avoid errors when the key is not set but you should not do that
});
const llm = new ChatOpenAI({
  model: "gpt-3.5-turbo",
  temperature: 0,
});
const tools = [
  new DynamicTool({
    name: "FOO",
    description:
      "call this to get the value of foo. input should be an empty string.",
    func: async () => "baz",
  }),
  new DynamicStructuredTool({
    name: "random-number-generator",
    description: "generates a random number between two input numbers",
    schema: z.object({
      low: z.number().describe("The lower bound of the generated number"),
      high: z.number().describe("The upper bound of the generated number"),
    }),
    func: async ({ low, high }) =>
      (Math.random() * (high - low) + low).toString(), // Outputs still must be strings
  }),
];
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a helpful assistant"],
  ["placeholder", "{chat_history}"],
  ["human", "{input}"],
  ["placeholder", "{agent_scratchpad}"],
]);
console.log("bye");
console.log("bye");
const agent = await createOpenAIFunctionsAgent({
  llm,
  tools,
  prompt,
});
console.log("bye2");
console.log("bye2");
const agentExecutor = new AgentExecutor({
  agent,
  tools,
  verbose: true,
});

const elevenLabsApiKey = "e4a2b4692a7a0c9ea9d4595486ecbd82";
const voiceID = "5mdPBLAzww874O7GCA9b";

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);
  await execCommand(
    `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`
    // -y to overwrite the file
  );
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);
  await execCommand(
    `./bin/rhubarb -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic`
  );
  // -r phonetic is faster but less accurate
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};
var history=[
  new HumanMessage("hi"),
  new AIMessage("hello"),
];
var i=0;
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  
  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "hello",
          audio: await audioFileToBase64("audios/welcome.wav"),
          lipsync: await readJsonTranscript("audios/intro_0.json"),
          facialExpression: "smile",
          animation: "Talking_1",
        },
      ],
    });
    return;
  }
  if (!elevenLabsApiKey || openai.apiKey === "-") {
    res.send({
      messages: [
        {
          text: "Please enter your api keys",
          audio: await audioFileToBase64("audios/api.wav"),
          lipsync: await readJsonTranscript("audios/api_0.json"),
          facialExpression: "angry",
          animation: "Angry",
        },
      ],
    });
    return;
  }
  var result = await agentExecutor.invoke({
    input: userMessage,
    chat_history: history,
  });
  history.push(new HumanMessage(userMessage));
  history.push(new AIMessage(result.output));
  console.log(userMessage);
  console.log(history)
  var fileName = `audios/message_${i}.mp3`; // The name of your audio file
  var textInput = result.output; // The text you wish to convert to speech
  await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);
  //await lipSyncMessage(i);
  res.send({
    messages: [
      {
        text: result.output,
        audio: await audioFileToBase64(fileName),
        lipsync: await readJsonTranscript(`audios/intro_0.json`),
        facialExpression: "smile",
        animation: "Talking_1",
      },
    ],
  });
  i++;
  return;
});

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

app.listen(port, () => {
  console.log(`Virtual Interviewer listening on port ${port}`);
});