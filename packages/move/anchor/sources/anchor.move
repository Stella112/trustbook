/// Holds a shop's latest sealed head hash, so that dropped newest days can be detected.
module anchor::anchor;

use sui::clock::Clock;

const EWrongCap: u64 = 0;
const EDayCountNotIncreasing: u64 = 1;

public struct HeadAnchor has key {
    id: UID,
    shop_id: vector<u8>,
    last_day: vector<u8>,
    head_hash: vector<u8>,
    day_count: u64,
    updated_ms: u64,
}

public struct AnchorCap has key, store {
    id: UID,
    anchor_id: ID,
}

/// Shares a new anchor and returns the capability that may update it.
public fun create(shop_id: vector<u8>, ctx: &mut TxContext): AnchorCap {
    let anchor = HeadAnchor {
        id: object::new(ctx),
        shop_id,
        last_day: vector[],
        head_hash: vector[],
        day_count: 0,
        updated_ms: 0,
    };
    let cap = AnchorCap { id: object::new(ctx), anchor_id: object::id(&anchor) };
    transfer::share_object(anchor);
    cap
}

public fun update(
    anchor: &mut HeadAnchor,
    cap: &AnchorCap,
    last_day: vector<u8>,
    head_hash: vector<u8>,
    day_count: u64,
    clock: &Clock,
) {
    assert!(cap.anchor_id == object::id(anchor), EWrongCap);
    assert!(day_count > anchor.day_count, EDayCountNotIncreasing);
    anchor.last_day = last_day;
    anchor.head_hash = head_hash;
    anchor.day_count = day_count;
    anchor.updated_ms = clock.timestamp_ms();
}

#[test_only]
public fun fields(a: &HeadAnchor): (vector<u8>, vector<u8>, vector<u8>, u64, u64) {
    (a.shop_id, a.last_day, a.head_hash, a.day_count, a.updated_ms)
}
