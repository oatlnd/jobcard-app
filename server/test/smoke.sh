#!/usr/bin/env bash
# Quick manual API check against a running server with seed data.
B=${B:-http://localhost:3000/api}
j() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log(eval(process.argv[1]))})' "$1"; }
T=$(curl -s -XPOST $B/auth/login -H 'content-type: application/json' -d '{"username":"advisor","password":"advisor123"}' | j 'o.token')
H="Authorization: Bearer $T"; C='content-type: application/json'
echo "== board";  curl -s $B/jobs/board -H "$H" | j 'o.map(x=>x.job_no+" "+x.status+" "+x.items_total).join("\n")'
echo "== create walk-in"; R=$(curl -s -XPOST $B/jobs -H "$H" -H "$C" -d '{"customer":{"name":"Test User","mobile":"077 555 1234","suburb":"Nallur","preferred_lang":"ta"},"bike":{"reg_no":"np bdd-9999","model":"Dio","year":2020},"odometer":15000,"complaint":"Service","service_type":"General Service"}')
echo "$R" | j 'o.error||o.job_no+" "+o.status+" "+o.customer.mobile+" notifications:"+o.notifications.length'
JID=$(echo "$R" | j 'o.id')
echo "== duplicate open job"; curl -s -XPOST $B/jobs -H "$H" -H "$C" -d "{\"bike_id\":$(echo "$R" | j 'o.bike_id')}"; echo
echo "== public status"; curl -s "$B/public/status?bike=NP-BDD%209999&mobile4=1234" | j 'o.job.status+" / "+o.job.label_ta'
echo "== wrong digits"; curl -s "$B/public/status?bike=NPBDD9999&mobile4=0000"; echo
echo "== add items"; curl -s -XPOST $B/jobs/$JID/items -H "$H" -H "$C" -d '{"item_type":"part","part_id":1,"qty":1}' | j 'o.error||o.items.length'
curl -s -XPOST $B/jobs/$JID/items -H "$H" -H "$C" -d '{"item_type":"labour","description":"Service labour","unit_price":2500}' | j 'o.error||JSON.stringify(o.totals)'
echo "== bad transition"; curl -s -XPOST $B/jobs/$JID/status -H "$H" -H "$C" -d '{"status":"READY"}'; echo
for s in IN_PROGRESS QA_CHECK READY; do curl -s -XPOST $B/jobs/$JID/status -H "$H" -H "$C" -d "{\"status\":\"$s\"}" | j 'o.error||o.status'; done
echo "== deliver without invoice"; curl -s -XPOST $B/jobs/$JID/status -H "$H" -H "$C" -d '{"status":"DELIVERED"}'; echo
echo "== invoice"; INV=$(curl -s -XPOST $B/jobs/$JID/invoice -H "$H" -H "$C" | j 'o.error||o.invoice.id+" "+o.invoice.invoice_no+" "+o.invoice.total'); echo $INV
IID=${INV%% *}
curl -s -XPOST $B/invoices/$IID/payment -H "$H" -H "$C" -d '{"amount":4950,"method":"Cash"}' | j 'o.error||o.status+" "+o.paid_amount'
curl -s -XPOST $B/jobs/$JID/status -H "$H" -H "$C" -d '{"status":"DELIVERED"}' | j 'o.error||o.status+" next due "+o.bike.next_service_due_date+" notes:"+o.notifications.map(n=>n.template).join(",")'
echo "== dashboard"; curl -s $B/dashboard/summary -H "$H"; echo
echo "== mechanic perms"; MT=$(curl -s -XPOST $B/auth/login -H "$C" -d '{"username":"kumar","password":"mech123"}' | j 'o.token')
curl -s -XPOST $B/jobs -H "Authorization: Bearer $MT" -H "$C" -d '{"bike_id":1}'; echo
