# Chat eval baseline

Date: 2026-10-10

```
Chat eval (parseQuery): 42/50
Rules-only score excluding aiExpected: 37/37
Per group:
  basic: 10/10
  slang_typo: 8/8
  negation: 5/5
  parking: 6/6
  near_me: 5/5
  vague: 0/6
  offtopic: 4/4
  greeting_abuse: 3/3
  followup: 1/3
Failing (8):
  [vague] (AI) "akşam romantik bir yer" -> food: want true, got false
  [vague] (AI) "çocukla gidilecek bir mekan" -> food: want true, got false
  [vague] (AI) "deniz kenarında oturup bir şeyler içelim" -> food: want true, got false
  [vague] (AI) "canım bir şey çekiyor ama ne bilmiyorum" -> food: want true, got false
  [vague] (AI) "arkadaşlarla kalabalık gidiyoruz ucuz bir yer olsun" -> food: want true, got false
  [vague] (AI) "sürpriz yap bana bir şey öner" -> food: want true, got false
  [followup] (AI) "daha yakını var mı" -> nearMe: want true, got false
  [followup] (AI) "otoparkı ücretsiz olsun" -> requireParking: want true, got false
```
