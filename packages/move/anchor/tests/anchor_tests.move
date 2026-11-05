#[test_only]
module anchor::anchor_tests;

use anchor::anchor::{Self, HeadAnchor, AnchorCap};
use sui::clock;
use sui::test_scenario as ts;

const OWNER: address = @0xA;

fun setup(scenario: &mut ts::Scenario, shop: vector<u8>) {
    scenario.next_tx(OWNER);
    let cap = anchor::create(shop, scenario.ctx());
    transfer::public_transfer(cap, OWNER);
    scenario.next_tx(OWNER);
}

#[test]
fun stores_fields_exactly() {
    let mut s = ts::begin(OWNER);
    setup(&mut s, b"shop");
    let mut a = s.take_shared<HeadAnchor>();
    let cap = s.take_from_sender<AnchorCap>();
    let mut c = clock::create_for_testing(s.ctx());
    c.set_for_testing(1234);
    a.update(&cap, b"2026-11-09", b"hash", 42, &c);
    let (shop, day, hash, count, ms) = a.fields();
    assert!(shop == b"shop" && day == b"2026-11-09" && hash == b"hash" && count == 42 && ms == 1234);
    c.destroy_for_testing();
    s.return_to_sender(cap);
    ts::return_shared(a);
    s.end();
}

#[test, expected_failure(abort_code = anchor::EDayCountNotIncreasing)]
fun rejects_day_count_not_increasing() {
    let mut s = ts::begin(OWNER);
    setup(&mut s, b"shop");
    let mut a = s.take_shared<HeadAnchor>();
    let cap = s.take_from_sender<AnchorCap>();
    let c = clock::create_for_testing(s.ctx());
    a.update(&cap, b"d1", b"h1", 5, &c);
    a.update(&cap, b"d2", b"h2", 5, &c);
    abort 0
}

#[test, expected_failure(abort_code = anchor::EWrongCap)]
fun rejects_cap_of_another_anchor() {
    let mut s = ts::begin(OWNER);
    // Created in separate transactions so each shared object can be taken by its ID.
    let other_cap = anchor::create(b"other", s.ctx());
    s.next_tx(OWNER);
    let other_id = ts::most_recent_id_shared<HeadAnchor>().extract();
    let mine_cap = anchor::create(b"mine", s.ctx());
    s.next_tx(OWNER);
    let mine_id = ts::most_recent_id_shared<HeadAnchor>().extract();
    assert!(other_id != mine_id);
    let mut mine = s.take_shared_by_id<HeadAnchor>(mine_id);
    let c = clock::create_for_testing(s.ctx());
    mine.update(&other_cap, b"d", b"h", 1, &c);
    transfer::public_transfer(mine_cap, OWNER);
    abort 0
}
