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
  apiKey: process.env.OPENAI_API_KEY || "-", // Your OpenAI API key here, I used "-" to avoid errors when the key is not set but you should not do that
});
const llm = new ChatOpenAI({
  model: "gpt-3.5-turbo",
  temperature: 0,
});

var qaLog=[];
var previousQuestions = []; 
var a_questions = [
  "Tell me about yourself and your experience.",
  "What attracted you to apply for this position?",
  "Can you describe a challenging problem you've faced in your previous role and how you solved it?",
  "How do you handle tight deadlines and multiple priorities?",
  "What are your strengths and weaknesses?",
  "Where do you see yourself in five years?",
  "Do you have any questions for us about the company or the position?",
];
const askQuestions = async () => {
  
  // Filter out previously asked questions
  const filteredQuestions = a_questions.filter(q => !previousQuestions.includes(q));

  // If all questions are asked, reset the list
  if (filteredQuestions.length === 0) {
    previousQuestions = [];
    return a_questions;
  }
  return filteredQuestions;
};

const tools = [
  new DynamicTool({
    name: "interview-question-generator",
    description: "Data science is an interdisciplinary field that combines statistics, computer science, and domain-specific knowledge to extract meaningful insights from data. It involves collecting, cleaning, and analyzing large datasets using various techniques such as machine learning, data mining, and predictive analytics. Data scientists use tools like Python, R, SQL, and visualization software to uncover patterns, make predictions, and support decision-making across different industries. The ultimate goal of data science is to turn data into actionable knowledge that drives strategic and operational decisions.",
    func: async () => {
      const description = "Write a short summary of your favorite book.";
      const response = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: `Generate 5 questions based on the following description:\n\n${description}\n\nQuestions:`,
        max_tokens: 150,
        n: 1,
        stop: ["\n\n"],
      });
      const questions = response.data.choices[0].text.trim().split('\n').filter(line => line !== "");
      a_questions.push(questions);
      return questions.join('\n');
    }
  }),
  new DynamicTool({
    name: "ask-interview-questions",
    description: "Asks interview questions to candidates without repetition",
    func: async () => {
      const questions = await askQuestions();
      // Pick a random question from the available questions
      const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
      // Add the asked question to the list of previous questions
      previousQuestions.push(randomQuestion);
      // Return the selected question
      return randomQuestion;
    }
  }),
  new DynamicStructuredTool({
    name: "check-user-answer",
    description: "Logs a question and answer given by the user",
    schema: z.object({
      question: z.string().describe("The question text"),
      answer: z.string().describe("The answer text"),
    }),
    func: async ({ question, answer }) => {
      qaLog.push({ question, answer });
      return "Question and answer logged successfully.";
    },
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
var history=[];
var i=0;
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  /*if(qaLog.length > 5 ){
      const textContent = list.join('\n');

      // Write the string to a text file
      fs.writeFile('.txt', textContent, (err) => {
      if (err) {
          console.error('Error writing to file', err);
      } else {
          console.log('List saved to list.txt');
      }
      });

    res.send({
      messages: [
        {
          text: "no more questions for you",
          audio: await audioFileToBase64('final.mp3'),
          lipsync: await readJsonTranscript(`audios/intro_0.json`),
          facialExpression: "smile",
          animation: "Talking_1",
        },
      ],
    });
    return;
  }*/
  if (!userMessage) {
    history.push(new HumanMessage("you should start the interview by generating quesions and ask the question to user"));
    var result = await agentExecutor.invoke({
      input: "start",
      chat_history: history,
    });
    history.push(new AIMessage(result.output));
    console.log(result.output);
    console.log(history)
    var fileName = `audios/message_${i}.mp3`; // The name of your audio file
    var textInput = result.output; // The text you wish to convert to speech
    await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);
    //await lipSyncMessage(i);
    res.send({
      messages: [
        {
          text: "hello",
          audio: await audioFileToBase64("audios/welcome.wav"),
          lipsync: await readJsonTranscript("audios/intro_0.json"),
          facialExpression: "smile",
          animation: "Talking_1",
        },
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
  }

  var result = await agentExecutor.invoke({
    input: "check this answer and log it into the log-question-answer: "+userMessage,
    chat_history: history,
  });
  
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

  console.log(qaLog)
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
