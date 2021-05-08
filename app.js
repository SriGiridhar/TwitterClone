const express = require("express");
const app = express();
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
app.use(express.json());
let db = null;
const dbPath = path.join(__dirname, "twitterClone.db");
const initializeDbAndServer = async () => {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });
  app.listen(3000, console.log("SERVER STARTED::"));
};
initializeDbAndServer();

//API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  console.log(request.body);
  const userQuery = `Select * from user where username = '${username}';`;
  const user = await db.get(userQuery);
  if (user !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    const a = password.length;
    if (a < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      try {
        const hashedPassword = await bcrypt.hash(request.body.password, 10);
        const insertQuery = `INSERT INTO user
        (name,username,password,gender)
        VALUES
        (
            '${name}',
            '${username}',
            '${hashedPassword}',
            '${gender}'
        );`;
        await db.run(insertQuery);
        response.status(200);
        response.send("User created successfully");
      } catch (e) {
        console.log(e.message);
      }
    }
  }
});

// API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const userCheckQuery = `Select * from user where username ='${username}';`;
  const user = await db.get(userCheckQuery);
  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, user.password);
    if (isPasswordMatched === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const payload = { username };
      const jwtToken = jwt.sign(payload, "SECRET");
      response.status(200);
      response.send({ jwtToken });
    }
  }
});

//AUTHENTICATION

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "SECRET", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.user_name = payload.username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { user_name } = request;
  const tweetQuery = ` select user.username,tweet.tweet,tweet.date_time as dateTime
  from (follower inner join user on user.user_id=follower.follower_user_id) as t1 inner join
   tweet on tweet.user_id=follower.follower_user_id where tweet.user_id in
   (select follower.following_user_id from follower 
    inner join user on user.user_id = follower.follower_user_id where user.username like "${user_name}") group by tweet.tweet_id;`;
  const dbUser = await db.all(tweetQuery);
  response.send(dbUser);
  console.log(dbUser);
});

//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { user_name } = request;
  const query = `select distinct(user.name) from follower 
  inner join user on user.user_id = follower.follower_user_id 
  where user.user_id IN (select follower.following_user_id from 
  follower inner join user on user.user_id=follower.follower_user_id 
  where user.username like '${user_name}');`;
  const user = await db.all(query);
  response.send(user);
});

// API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { user_name } = request;
  const query = `select distinct(user.name) from follower 
  inner join user on user.user_id = follower.follower_user_id 
  where user.user_id IN (select follower.follower_user_id from 
  follower inner join user on user.user_id=follower.following_user_id 
  where user.username like '${user_name}');`;
  const user = await db.all(query);
  response.send(user);
});

// API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { user_name } = request;
  const query = `select tweet.tweet,count(distinct(like_id)) as likes,count(distinct(reply_id)) as replies,tweet.date_time as dateTime 
  from (tweet inner join like on like.tweet_id = tweet.tweet_id) as t1 inner join 
  reply on reply.tweet_id=t1.tweet_id where tweet.tweet_id = ${tweetId} and tweet.user_id 
  in (select follower.following_user_id from follower inner join user on 
  user.user_id=follower.follower_user_id where user.username like '${user_name}');`;
  const user = await db.get(query);
  const { tweet } = user;
  if (tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(user);
  }
});
//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { user_name } = request;
    const query = `select user.username as likes
  from (user inner join like on like.user_id = user.user_id) as t1 inner join 
  tweet on tweet.tweet_id=t1.tweet_id where tweet.tweet_id = ${tweetId} and tweet.user_id 
  in (select follower.following_user_id from follower inner join user on 
  user.user_id=follower.follower_user_id where user.username like '${user_name}');`;
    const user = await db.all(query);
    let lis = [];
    let likes = "";
    for (let i in user) {
      const { likes } = user[i];
      lis.push(likes);
    }
    if (lis[0] === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ likes: lis });
    }
    console.log(lis[0]);
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { user_name } = request;
    const query = `select user.name,reply.reply
  from (user inner join reply on reply.user_id = user.user_id) as t1 inner join 
  tweet on tweet.tweet_id=t1.tweet_id where tweet.tweet_id = ${tweetId} and tweet.user_id 
  in (select follower.following_user_id from follower inner join user on 
  user.user_id=follower.follower_user_id where user.username like '${user_name}');`;
    const user = await db.all(query);
    if (user[0] === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ replies: user });
    }
  }
);
//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { user_name } = request;
  const query = `select tweet.tweet,count(distinct(like_id)) as likes,count(distinct(reply_id)) as replies,tweet.date_time as dateTime 
  from (tweet inner join like on like.tweet_id = tweet.tweet_id) as t1 inner join 
  reply on reply.tweet_id=t1.tweet_id where tweet.tweet_id 
  in (select tweet.tweet_id from user inner join tweet on tweet.user_id = user.user_id
     where user.username like '${user_name}') group by tweet.tweet_id;`;
  const user = await db.all(query);
  response.send(user);
  console.log(user);
});
//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { user_name } = request;
  const user = `select user_id from user where username ='${user_name}';`;
  const userId = await db.get(user);
  const { user_id } = userId;
  const insertQuery = `insert into tweet 
  (tweet,user_id)
  VALUES 
  ('${tweet}',
  ${user_id});`;
  const insert = await db.run(insertQuery);
  console.log(insert);
  response.send("Created a Tweet");
});

// API 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { user_name } = request;
    const deleteQuery = `Delete from tweet where tweet_id=${tweetId} and
    tweet.user_id = (select user_id from user where username='${user_name}');`;
    const del = await db.run(deleteQuery);
    const changes = del.changes;
    console.log(changes);
    if (changes === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send("Tweet Removed");
    }
  }
);
module.exports = app;
