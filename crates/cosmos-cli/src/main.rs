//! `cosmos`: the command-line bridge between agent harnesses and `cosmosd`.

mod schema;
mod spike;

use std::path::PathBuf;
use std::process::ExitCode;

use anyhow::Result;
use clap::{Parser, Subcommand};
use cosmos_ipc::{method, ClientKind, Endpoint};
use cosmos_storage::paths;

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Parser, Debug)]
#[command(name = "cosmos", version, about = "COSMOS command line")]
struct Cli {
    /// Override the app data directory (also `COSMOS_DATA_DIR`).
    #[arg(long, global = true, env = "COSMOS_DATA_DIR")]
    data_dir: Option<PathBuf>,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Show whether cosmosd is running and which versions it speaks.
    Status,
    /// Ask cosmosd to stop.
    Stop,
    /// Print the resolved vault, data and endpoint locations.
    Paths,
    /// Export or check the versioned JSON Schemas (ADR 0005).
    Schema {
        #[command(subcommand)]
        action: schema::SchemaAction,
    },
    /// Phase 0 experiments.
    Spike {
        #[command(subcommand)]
        action: spike::SpikeAction,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(cli) {
        Ok(code) => code,
        Err(e) => {
            eprintln!("cosmos: {e:#}");
            ExitCode::FAILURE
        }
    }
}

fn run(cli: Cli) -> Result<ExitCode> {
    let data_dir = match &cli.data_dir {
        Some(d) => d.clone(),
        None => paths::app_data_dir()?,
    };
    match cli.command {
        Command::Status => status(&data_dir),
        Command::Stop => stop(&data_dir),
        Command::Paths => {
            println!("vault    {}", display(paths::default_vault_dir()));
            println!("data     {}", data_dir.display());
            println!("endpoint {}", Endpoint::default_for(&data_dir));
            Ok(ExitCode::SUCCESS)
        }
        Command::Schema { action } => schema::run(action),
        Command::Spike { action } => spike::run(action),
    }
}

fn display(p: Result<PathBuf, cosmos_storage::Error>) -> String {
    match p {
        Ok(p) => p.display().to_string(),
        Err(e) => format!("<unavailable: {e}>"),
    }
}

fn runtime() -> Result<tokio::runtime::Runtime> {
    Ok(tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?)
}

fn status(data_dir: &std::path::Path) -> Result<ExitCode> {
    let endpoint = Endpoint::default_for(data_dir);
    runtime()?.block_on(async {
        match cosmos_ipc::connect_and_hello(&endpoint, ClientKind::Cli, VERSION).await {
            Ok((_, hello)) => {
                println!(
                    "cosmosd running · v{} · protocol v{} · schema v{} · pid {} · up {}s",
                    hello.daemon_version,
                    hello.protocol_version,
                    hello.schema_version,
                    hello.pid,
                    hello.uptime_secs
                );
                Ok(ExitCode::SUCCESS)
            }
            Err(cosmos_ipc::IpcError::Io(_)) => {
                println!("cosmosd stopped ({endpoint})");
                Ok(ExitCode::from(3))
            }
            Err(e) => Err(e.into()),
        }
    })
}

fn stop(data_dir: &std::path::Path) -> Result<ExitCode> {
    let endpoint = Endpoint::default_for(data_dir);
    runtime()?.block_on(async {
        let (mut client, _) =
            cosmos_ipc::connect_and_hello(&endpoint, ClientKind::Cli, VERSION).await?;
        client
            .call(method::SHUTDOWN, serde_json::Value::Null)
            .await?;
        println!("cosmosd stopping");
        Ok(ExitCode::SUCCESS)
    })
}
