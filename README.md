# Dynamic Website Chatbot
This project is a full-stack, AI-powered chatbot that can answer questions about any publicly accessible website. Users provide a URL, and the application dynamically scrapes the site's content, builds a knowledge base, and enables a conversational chat interface powered by a Retrieval-Augmented Generation (RAG) pipeline.

The application is built with Node.js, Express, LangChain.js, and is containerized with Docker for seamless deployment to Google Cloud Platform (GCP).

# Live Demo
URL: https://website-chatbot-service-300605981372.us-central1.run.app/


# Features
Dynamic Data Ingestion: Scrapes any provided website URL recursively to gather textual content.
Persistent Caching: Vector stores are cached in Google Cloud Storage (or the local filesystem) to prevent re-scraping and provide near-instantaneous loading for previously visited sites.
Advanced RAG Pipeline: Uses LangChain.js to orchestrate a sophisticated RAG chain.
LLM-Based Reranking: Improves retrieval accuracy by using a language model to rerank search results before synthesizing an answer.
Conversational Memory: Remembers the context of the conversation, allowing for natural follow-up questions.
Strictly Contextual Answers: The AI is instructed to answer questions only based on the provided website content, preventing hallucinations.
Cloud-Ready: Containerized with Docker and prepared for scalable deployment on GCP Cloud Run.
# Tech Stack
Backend: Node.js, Express.js
AI/LLM Framework: LangChain.js
LLM & Embeddings: OpenAI (GPT-3.5-Turbo)
Vector Store: FAISS (Facebook AI Similarity Search)
Web Scraping: Axios, Cheerio
Frontend: HTML5, CSS3, Vanilla JavaScript
Deployment: Docker, Google Cloud Run, Google Cloud Storage
Local Development Setup
Prerequisites
Node.js (v20.x or later)
Docker Desktop
An OpenAI API Key
# Installation
Clone the repository:

git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
Install dependencies:

npm install
Set up environment variables:
Create a .env file in the root directory and add your OpenAI API key:

OPENAI_API_KEY="sk-..."
Running the Application
1. In Development Mode (with Nodemon)
This will run the server on http://localhost:3000 and automatically restart on file changes.

npm start
2. Using Docker (Production Simulation)
This builds and runs the production-ready Docker container.

Build the Docker image:

docker build -t website-chatbot .
Run the container:
This command maps port 8080 on your local machine to port 3000 in the container and injects the environment variables.

docker run --rm -p 8080:3000 --env-file .env website-chatbot
The application will be accessible at http://localhost:8080.

Deployment to Google Cloud Platform
The application is designed for serverless deployment on GCP Cloud Run.

Prerequisites: A GCP project with billing enabled, the gcloud CLI installed, and the run, storage, and artifactregistry APIs enabled.

Create GCS Bucket & Artifact Registry: Create a GCS bucket for caching and an Artifact Registry repository to store the Docker image.

Build and Push the Image:

# Replace YOUR_PROJECT_ID with your GCP Project ID
export IMAGE_TAG="us-central1-docker.pkg.dev/YOUR_PROJECT_ID/website-chatbot-repo/website-chatbot:1.0.0"

# Configure Docker authentication
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build and push
docker build -t $IMAGE_TAG .
docker push $IMAGE_TAG
Deploy to Cloud Run:
Deploy the image and set the required environment variables.

# Replace with your bucket name and API key
export GCS_BUCKET_NAME="your-unique-cache-bucket-name"
export OPENAI_KEY="sk-..."

gcloud run deploy website-chatbot-service \
  --image=$IMAGE_TAG \
  --platform=managed \
  --region=us-central1 \
  --allow-unauthenticated \
  --set-env-vars="OPENAI_API_KEY=$OPENAI_KEY,GCS_BUCKET_NAME=$GCS_BUCKET_NAME"
