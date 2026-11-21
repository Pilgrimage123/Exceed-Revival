fn main() {
    let command = std::env::args().nth(1).unwrap_or_else(|| "protocol-version".to_owned());
    match command.as_str() {
        "protocol-version" => println!("{}", exceed_ai_core::PROTOCOL_VERSION),
        "self-test" => {
            let matrix = vec![vec![1.0, -1.0], vec![-1.0, 1.0]];
            let result = exceed_ai_core::solve_zero_sum_cfr(&matrix, 20_000).expect("valid matrix");
            println!("protocol={} mix={:.4},{:.4} value={:.4}", exceed_ai_core::PROTOCOL_VERSION, result.probabilities[0], result.probabilities[1], result.value);
        }
        _ => { eprintln!("usage: exceed-ai [protocol-version|self-test]"); std::process::exit(2); }
    }
}
