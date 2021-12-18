const express = require("express");
const fs = require("fs");
const mongoose = require("mongoose");
const crypto = require("crypto");
const { body, validationResult } = require("express-validator");

const { constantManager, mapManager, monsterManager, itemManager } = require("./datas/Manager");
const { Player } = require("./models/Player");
const { Item } = require("./models/Item");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.set("views", __dirname + "/views");
app.set("view engine", "ejs");
app.engine("html", require("ejs").renderFile);

mongoose.connect(
    "mongodb+srv://test0:test0@testmongo.nwu7w.mongodb.net/gameServer?retryWrites=true&w=majority",
    { useNewUrlParser: true, useUnifiedTopology: true }
);

const authentication = async (req, res, next) => {
  const { authorization } = req.headers;
  if (!authorization) return res.sendStatus(401);
  const [bearer, key] = authorization.split(" ");
  if (bearer !== "Bearer") return res.sendStatus(401);
  const player = await Player.findOne({ key });
  if (!player) return res.sendStatus(401);

  req.player = player;
  next();
};

app.get("/", (req, res) => {
  res.render("index", { gameName: constantManager.gameName });
});

app.get("/game", (req, res) => {
  res.render("game");
});

app.post("/signup", async (req, res) => {
  const { email, password, name } = req.body;

  if (await Player.exists({ email })) {
    return res.status(400).send({ error: "Player already exists" });
  }
  const player = new Player({
    email,
    password,
    name,
    level: 1,
    exp: 0,
    maxHP: 10,
    HP: 10,
    str: 5,
    def: 5,
    x: 0,
    y: 0
  });

  const key = crypto.randomBytes(24).toString("hex");
  player.key = key;

  await player.save();

  return res.send({ key });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  //const encryptedPassword = encryptPassword(password);
  const player = await Player.findOne({email, password});

  if (player === null)
    return res.sendStatus(404);

  const key = player.key;

  return res.send({ key });
})


app.post("/action", authentication, async (req, res) => {
  const { action } = req.body;
  const player = req.player;
  let event = null;
  let field = null;
  let actions = [];
  if (action === "query") {
    field = mapManager.getField(req.player.x, req.player.y);
  } else if (action === "move") {
    const direction = parseInt(req.body.direction, 0); // 0 북. 1 동 . 2 남. 3 서.
    let x = req.player.x;
    let y = req.player.y;
    if (direction === 0) {
      x += 1;
    } else if (direction === 1) {
      x -= 1;
    } else if (direction === 2) {
      y -= 1;
    } else if (direction === 3) {
      y += 1;
    } else {
      res.sendStatus(400);
    }
    field = mapManager.getField(x, y);
    if (!field) res.sendStatus(400);
    player.x = x;
    player.y = y;

    const events = field.events;
    const actions = [];
    if (events.length > 0) {
      // TODO : 확률별로 이벤트 발생하도록 변경
      const eventPercent = Math.random()*100;
      //console.log(eventPercent);
      //console.log(events[0].percent);

      let _event = events[0];
      if(events[0].percent < eventPercent) {
        _event = events[1];
      }

      if (_event.type === "battle") {
        // TODO: 이벤트 별로 events.json 에서 불러와 이벤트 처리
        const monster = monsterManager.getMonster(_event.monster)
        event = { description: `${monster.name}가 나타났다` };
        // 플레이어의 공격력에서 몬스터의 방어력 뺀만큼 몬스터에게 피해 입힘

        let attackCounts;
        if(player.str <= monster.def){
          attackCounts = monster.hp;
        }else{
          attackCounts = monster.hp / (player.str - monster.def);
        }

        let playerDamaged;
        if(player.def >= monster.str){
          playerDamaged = attackCounts*-1;
        }else{
          playerDamaged = attackCounts*(player.def - monster.str);
        }

        player.incrementHP( playerDamaged );
        player.incrementEXP(monster.exp);

      } else if (_event.type === "item") {
        const item = itemManager.getItem(_event.item);
        event = { description: `${item}을 획득했다` };

        const playerItem = new Item({itemId : item.id, user });
        playerItem.save();

        player.incrementSTR(item.str);
        player.incrementDEF(item.def);

      } else if (_event.type = "heal"){

      } else if (_event.type = "nothing"){

      }

    }

    await player.save();
  }
  const EWSN = ['동', '서', '남', '북'];
  field.canGo.forEach((direction, i) => {
    if (direction === 1) {
      actions.push({
        url: "/action",
        text: EWSN[i],
        params: { direction: i, action: "move" }
      });
    }
  });

  return res.send({ player, field, event, actions });
});

app.listen(3000);