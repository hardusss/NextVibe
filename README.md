# **🚀 NextVibe**

A new #1 Web3 Social Media with Social2Earn mechanism, NFTs, AI and Crypto.

## **📋 Table of Contents**

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [Moderation Service](#moderation-service)
- [Chat Service (FastAPI)](#chat-service-fastapi)
- [Redis Setup](#redis-setup)
- [Celery Setup](#celery-setup)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)

## **🔧 Prerequisites**

Make sure you have the following installed on your system:

- **Python 3.11.4**
- **Node.js** (v20.17.0)
- **npm** (10.8.2)
- **JDK** (17.0.16)
- **Android Studio**
- **Go** (latest version)
- **MySQL**
- **MySQL Workbench**
- **Redis**
- **Celery**

## **🚀 Getting Started**

First, clone the repository to your local machine:

```bash
git clone https://github.com/hardusss/NextVibe.git
cd NextVibe
```

## **🔴 Backend Setup**

### **Step 1: Navigate to Backend Directory**
```bash
cd NextVibe/backend/
```

### **Step 2: Create and Activate Virtual Environment**
```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate

# macOS/Linux:
source .venv/bin/activate
```

### **Step 3: Install Dependencies**
```bash
pip install -r modules.txt
```

> ⚠️ **Note**: If errors occur when starting the server, install any additional libraries that are listed in the error messages.

### **Step 4: Install Redis and Celery**
```bash
# Install Redis and Celery
pip install redis celery
```

### **Step 5: Configure Database Environment**

Create `.env` file in `NextVibe/backend/NextVibeAPI/`:

```env
DB_NAME=nextvibe
DB_USER=ur_user
DB_PASSWORD=ur_passwd
DB_HOST=localhost
DB_PORT=3306
```

### **Step 6: Configure Posts Service Environment**

Create `.env` file in `NextVibe/backend/posts/src/`:

```env
REPLICATE_API_TOKEN=r8_TioXtphu5tAlcBlKRFGr1ZDhLIczUgk1HVyDx
```

> ⚠️ **Warning**: Please do not make too many image creation requests as limits may apply.

### **Step 7: Start Django Server**
```bash
python manage.py runserver 0.0.0.0:8000
```

## **📱 Frontend Setup**

### **Step 1: Install Required Tools**
- Download and install **Android Studio**
- Install **Node.js** (v20.17.0)
- Install **npm** (10.8.2)
- Install **JDK** (17.0.16)

### **Step 2: Navigate to Frontend Directory**
```bash
cd NextVibe/frontend/NextVibe
```

### **Step 3: Install Dependencies**
```bash
# Install Expo CLI
npm install expo@53.0.22

# Install project dependencies
npx expo install
```

### **Step 4: Build Application**
```bash
eas build --platform android --profile development
```

Download the built app to your emulator or real mobile device.

### **Step 5: Configure API URL**
In `NextVibe/frontend/NextVibe/src/utils/url_api.ts`, set your IP address for API connections.

### **Step 6: Start Application**
```bash
npx expo start
```

Press **`a`** to open on Android emulator.

## **🛡️ Moderation Service (Go)**

### **Step 1: Navigate to Moderation Service Directory**
```bash
cd NextVibe/moderation_service
```

### **Step 2: Download Go Modules**
```bash
go mod tidy
# or
go mod download
```

### **Step 3: Configure Environment Variables**

Create `.env` file in the moderation service root directory:

```env
SIGHTENGINE_USER=64529326
SIGHTENGINE_SECRET=JdaoFRxzStTVLN2bhQWVLjnrF7UhE6hx
PORT=8080

SIGHTENGINE_USER2=1705451817
SIGHTENGINE_SECRET2=MmxhSgHxVGfjqyyq9UzL82JWdsk3JRtK

SIGHTENGINE_USER3=1012150028
SIGHTENGINE_SECRET3=W72CExMzjWd66LwhbKdHAi4EJMBuVudj

SIGHTENGINE_USER4=216982646
SIGHTENGINE_SECRET4=iD5qgddYhzNrS8jV3RERMzjCzPYYiqn5

SIGHTENGINE_USER5=1496669676
SIGHTENGINE_SECRET5=DKboAbSx5FTA7y22oZiKkotW4G624QH9

SIGHTENGINE_USER6=1995678318
SIGHTENGINE_SECRET6=XUKsuTXY8kjNy5SRhz9t7qNuG7nTUqUy

SIGHTENGINE_USER7=1673586046
SIGHTENGINE_SECRET7=XdKwkH8tAZ2AaywSRVQ5oYvwMeYgmZvP

SIGHTENGINE_USER8=1739177191
SIGHTENGINE_SECRET8=vnXvzpKYUsMSNtV7JifLu566CUwvFJmy

SIGHTENGINE_USER9=36901041
SIGHTENGINE_SECRET9=n7qegCs46EKZGKbHVVqvWNKtv7x4Wt2H

SIGHTENGINE_USER10=1316397818
SIGHTENGINE_SECRET10=rAnygmzCbKqN3aCUifhBQwbK2RoW25mG
```

### **Step 4: Start Go Server**
```bash
go run .
```

## **💬 Chat Service (FastAPI)**

### **Step 1: Navigate to Socket Service Directory**
```bash
cd NextVibe/socket_service
```

### **Step 2: Activate Virtual Environment**
```bash
# Go to backend directory and activate the same virtual environment
cd ../backend
source .venv/bin/activate  # macOS/Linux
# or
.venv\Scripts\activate     # Windows

# Return to socket service directory
cd ../socket_service
```

### **Step 3: Configure Environment Variables**

Create `.env` file in the socket service root directory with the same database connection settings as the backend:

```env
DB_NAME=nextvibe
DB_USER=ur_user
DB_PASSWORD=ur_passwd
DB_HOST=localhost
DB_PORT=3306
```

### **Step 4: Start FastAPI Server**
```bash
uvicorn main:app --host 0.0.0.0 --port 8081 --reload
```

## **🔥 Redis Setup**

### **Step 1: Install Redis**

**Windows:**
1. Download Redis from [https://redis.io/download](https://redis.io/download) or use Windows Subsystem for Linux (WSL)
2. Alternatively, use Redis through Docker:
```bash
docker run -d -p 6379:6379 redis:latest
```

**macOS:**
```bash
# Using Homebrew
brew install redis

# Start Redis service
brew services start redis
```

**Linux (Ubuntu/Debian):**
```bash
# Install Redis
sudo apt update
sudo apt install redis-server

# Start Redis service
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### **Step 2: Verify Redis Installation**
```bash
# Test Redis connection
redis-cli ping
# Should return: PONG
```

### **Step 3: Start Redis Server**
```bash
# Start Redis server (if not running as service)
redis-server
```

## **⚡ Celery Setup**

### **Step 1: Navigate to Backend API Directory**
```bash
cd NextVibe/backend/NextVibeAPI
```

### **Step 2: Ensure Virtual Environment is Active**
```bash
# Activate virtual environment if not already active
# Windows:
../.venv/Scripts/activate

# macOS/Linux:
source ../.venv/bin/activate
```

### **Step 3: Install Celery (if not already installed)**
```bash
pip install celery redis
```

### **Step 4: Start Celery Worker**
```bash
celery -A NextVibeAPI worker -l info
```

> 📝 **Note**: Keep this terminal window open while running the application to process background tasks.

## **🗄️ Database Setup (MySQL)**

### **Step 1: Download Database File**
Download the `.sql` file containing the database structure and data.

### **Step 2: Open MySQL Workbench**
Launch MySQL Workbench on your system.

### **Step 3: Create Database**
Create a new database named `nextvibe`.

### **Step 4: Import Database**
1. Go to **Server** → **Data Import**
2. Select **Import from Self-Contained File**
3. Enter the path to your `.sql` file
4. At **Default target Schema**, select `nextvibe`
5. Press **Import**

## **🏃‍♂️ Running the Application**

To run the complete NextVibe application, you need to start all services in the following order:

1. **Redis**: `redis-server` (or ensure Redis service is running)
2. **Database**: Ensure MySQL is running with the `nextvibe` database
3. **Backend**: `python manage.py runserver 0.0.0.0:8000`
4. **Celery Worker**: `celery -A NextVibeAPI worker -l info` (in NextVibe/backend/NextVibeAPI/)
5. **Chat Service**: `uvicorn main:app --host 0.0.0.0 --port 8081 --reload`
6. **Moderation Service**: `go run .`
7. **Frontend**: `npx expo start`

## **🔗 Service Endpoints**

- **Backend API**: `http://ur_ip(on frontend or localhost(127.0.0.1) in Postman for testing):8000`
- **Chat Service**: `http://ur_ip(on frontend or localhost(127.0.0.1) in Postman for testing):8081`
- **Moderation Service**: `http://localhost:8080`
- **Redis**: `localhost:6379` (default port)
- **Frontend**: Expo development server (scan QR code or press 'a' for Android)

## **📝 Important Notes**

- Make sure all environment variables are properly configured before starting the services
- Configure your IP address in `NextVibe/frontend/NextVibe/src/utils/url_api.ts` for proper API connectivity
- The Replicate API token has usage limits, so avoid excessive image generation requests
- Ensure all required ports (6379, 8000, 8080, 8081) are available on your system
- For mobile development, make sure your Android emulator is running or your physical device is connected
- Redis must be running before starting the Django backend and Celery worker
- Keep the Celery worker terminal open to process background tasks

## **🤝 Contributing**

Please read the contributing guidelines before making any changes to the codebase.

