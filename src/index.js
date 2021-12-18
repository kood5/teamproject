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

const encryptPassword = (password) => {
  return crypto.createHash("sha512").update(password).digest("base64");
};

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

app.post("/signup",body("email").isEmail().isLength({max: 99}), body("name").isLength({min:2, max: 12}), body("password").isLength({min: 8, max: 16}), async (req, res) => {
  const errors = validationResult(req);
  if(!errors.isEmpty()){
    return res.status(400).json({errors: errors.array()});
  }
  const { email, password, name } = req.body;
  if (await Player.exists({ email })) {
    return res.status(400).send({ error: "Player already exists" });
  }
  const encryptedPassword = encryptPassword(password);
  const player = new Player({
    email: email,
    password: encryptedPassword,
    name: name,
    level: 1,
    exp: 0,
    maxHP: 100,
    HP: 100,
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
  const encryptedPassword = encryptPassword(password);
  const player = await Player.findOne({email, password: encryptedPassword});

  if (player === null)
    return res.sendStatus(404);
  const key = player.key

  return res.send({ key });
})


app.post("/action", authentication, async (req, res) => {
  const { action } = req.body;
  const player = req.player;
  let event = null;
  let field = null;
  let actions = [];
  let validItem = [];
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
      y += 1;
    } else if (direction === 3) {
      y -= 1;
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
        // 플레이어의 공격력에서 몬스터의 방어력 뺀만큼 몬스터에게 피해 입힘

        let attackCounts;
        if(player.str <= monster.def){
          attackCounts = monster.hp;
        }else{
          attackCounts = Math.ceil(monster.hp / (player.str - monster.def));
        }

        let playerDamaged;
        if(player.def >= monster.str){
          playerDamaged = attackCounts*-1;
        }else{
          playerDamaged = attackCounts*(player.def - monster.str);
        }

        player.incrementHP( playerDamaged );
        //사망시 초기화
        if (player.HP <= 0) {
          player.HP = 100;
          player.x = 0;
          player.y = 0;
          //랜덤으로 아이템 분실
          let items = await Item.find({player, isValid:true});
          if (items.length > 0) {
            let deletedItem = items[Math.floor(Math.random() * items.length)]
            deletedItem.isValid = false;
            player.str -= itemManager.getItem(deletedItem.itemId).str;
            player.def -= itemManager.getItem(deletedItem.itemId).def;
            event = { description: `${monster.name}가 나타났다.\n사망하여 ${itemManager.getItem(deletedItem.itemId).name}을 잃어버렸다.\n0,0으로 돌아간다.` };
          } else{
            event = { description: `${monster.name}가 나타났다.\n사망하여 0,0으로 돌아간다.` };
          }
        }else {
          player.incrementEXP(parseInt(monster.exp));
          // 경험치 100 도달시 레벨업
          if (player.exp >= 100) {
            player.level += 1;
            player.str += 1;
            player.def += 1;
            player.exp -= 100;
            event = { description: `${monster.name}가 나타났다.\n 전투에서 승리해 경험치를 ${monster.exp}만큼 얻었다.\n레벨업했다.`};
          } else{
            event = { description: `${monster.name}가 나타났다.\n 전투에서 승해해 경험치를 ${monster.exp}만큼 얻었다.` };
          }
        }

      } else if (_event.type === "item") {
        const item = itemManager.getItem(_event.item);


        const playerItem = new Item({itemId : item.id, player, isValid : true });
        playerItem.save();

        player.incrementSTR(item.str);
        player.incrementDEF(item.def);

        event = { description: `${item.name}을 획득했다\n str이${item.str}, def가${item.def}만큼 증가했다.` };
      } else if (_event.type = "heal"){
        event = { description: `HP를 10만큼 회복했다.` };
        player.incrementHP(10);
      } else if (_event.type = "nothing"){
        event = { description: `아무일도 일어나지 않았다.` };
      }

    }

    await player.save();
  }
  const EWSN = ['동', '서', '남', '북'];
  field = mapManager.getField(req.player.x, req.player.y);
  field.canGo.forEach((direction, i) => {
    if (direction === 1) {
      actions.push({
        url: "/action",
        text: EWSN[i],
        params: { direction: i, action: "move" }
      });
    }
  });

  const items = await Item.find({player, isValid: true});
  for (const item of items) {
    validItem.push(itemManager.getItem(item.itemId).name);
  }
  return res.send({ player, field, event, actions, validItem });
});

app.listen(3000);
