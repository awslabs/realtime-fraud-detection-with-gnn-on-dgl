#!/bin/bash -x
set -o errexit

export PATH=/opt/awscli/:$PATH

main() {
  check_args "$@"

  local origin_model=$1
  local target_model=$2
  local code_package=$3
  local tmpFolder=$4

  export WORK_DIR=`mktemp -d --suffix '-repackage' -p "$tmpFolder"`

  if [[ ! "$WORK_DIR" || ! -d "$WORK_DIR" ]]; then
    echo "Could not create temp dir under $tmpFolder"
    exit 1
  fi
  
  trap cleanup EXIT

  aws s3 cp $origin_model $WORK_DIR/model.tar.gz
  MODEL_DIR="$WORK_DIR"/repackge-model
  mkdir -p "$MODEL_DIR/code"
  aws s3 sync $code_package "$MODEL_DIR/code"
  tar -xvf "$WORK_DIR"/model.tar.gz -C "$MODEL_DIR" --exclude='*.csv'
  mv "$MODEL_DIR/metadata.pkl" "$MODEL_DIR/code"
  tar -czf "$WORK_DIR"/model-repackaged.tar.gz -C "$MODEL_DIR" .
  aws s3 cp "$WORK_DIR"/model-repackaged.tar.gz $target_model
}

# deletes the temp directory
function cleanup {      
  rm -rf "$WORK_DIR"
  echo "Deleted temp working directory $WORK_DIR"
}

# Makes sure that we provided (from the cli) 
# enough arguments.
check_args() {
  if (($# != 4)); then
    echo "Error:
    Four arguments must be provided - $# provided.
    Usage:
      $0 <original model> <repackage model> <code path> <tmp folder>
Aborting."
    exit 1
  fi
}

# Run the entry point with the CLI arguments
# as a list of words as supplied.
main "$@"